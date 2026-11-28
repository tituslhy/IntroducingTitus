"""Patch the official Kokoro fp16 model: every ReduceMean/ReduceSum runs in fp32 (cast in, reduce, cast back).

ONNX Runtime 1.31's WebGPU EP sums a reduction in the tensor's own type. Kokoro's AdaIN layers average thousands of
fp16 samples; the running sum passes 65504, the mean becomes Inf, (x - mean) / std becomes Inf/Inf = NaN, and the NaN
reaches the waveform (29-61% of samples, Chrome and iPhone alike). The means themselves fit fp16, so only the
reduction needs fp32. Load the result with graphOptimizationLevel "basic": the "extended" fusions merge these fp32
reductions back into fp16 ones and the NaN returns (Chrome, 2026-11-28: patched + basic = clean, patched + all = NaN,
official at any level = NaN).

Usage (Python 3.12 with onnx; the input is the official onnx/model_fp16.onnx from
onnx-community/Kokoro-82M-v1.0-ONNX on Hugging Face):
    uv run --with onnx scripts/kokoro/patch-fp16.py model_fp16.onnx model_fp16_patched.onnx
"""
import os, sys
import onnx
from onnx import TensorProto, helper, shape_inference

src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src)
g = m.graph
inf = shape_inference.infer_shapes(m)
types = {v.name: v.type.tensor_type.elem_type for v in list(inf.graph.value_info) + list(g.input) + list(g.output)}

out, n_patched = [], 0
for n in g.node:
    if n.op_type in ("ReduceMean", "ReduceSum") and types.get(n.input[0]) == TensorProto.FLOAT16:
        x32, y32, y = n.input[0] + f"_{n_patched}_f32", n.output[0] + "_f32", n.output[0]
        out.append(helper.make_node("Cast", [n.input[0]], [x32], to=TensorProto.FLOAT, name=n.name + "_in_f32"))
        n.input[0] = x32
        n.output[0] = y32
        out.append(n)
        out.append(helper.make_node("Cast", [y32], [y], to=TensorProto.FLOAT16, name=n.name + "_out_f16"))
        n_patched += 1
    else:
        out.append(n)
del g.node[:]
g.node.extend(out)
onnx.checker.check_model(m)
onnx.save(m, dst)
print("patched", n_patched, "reductions; size MB", round(os.path.getsize(dst) / 1e6, 2))
