"""Run every node whose name starts with one of PREFIXES in fp32, in an fp16 Kokoro model.

Inputs coming from outside the set are cast up, fp16 initializers get fp32 copies, fp16 Constant/ConstantOfShape
values and Cast(to=fp16) inside the set become fp32, and outputs read outside the set are cast back to fp16.
Usage: promote-fp32.py IN OUT PREFIX [PREFIX ...]

Kokoro for the browser (2026-11-28): fp16 on WebGPU crackles (3x the energy above 7 kHz of fp32). Running the
generator's later layers in fp32 removes it (0.8%, as clean as fp32) for 172 MB instead of 163:
    G=/decoder/decoder/generator
    promote-fp32.py model_fp16_patched.onnx model_fp16_voice.onnx $G/ "!$G/resblocks.0/" "!$G/resblocks.1/" \
        "!$G/resblocks.2/" "!$G/ups.0/" "!$G/noise_res.0/" "!$G/noise_convs.0/"
(model_fp16_patched.onnx is patch-fp16.py's output.) Load with graphOptimizationLevel "basic".
"""
import os, sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper, shape_inference

src, dst, prefixes = sys.argv[1], sys.argv[2], sys.argv[3:]
m = onnx.load(src)
g = m.graph
inf = shape_inference.infer_shapes(m)
types = {v.name: v.type.tensor_type.elem_type for v in list(inf.graph.value_info) + list(g.input) + list(g.output)}
inits = {i.name: i for i in g.initializer}
for k, v in inits.items():
    types[k] = v.data_type
graph_outputs = {o.name for o in g.output}

nodes = list(g.node)
# A prefix starting with "!" excludes: "/a/" "!/a/b/" means everything under /a/ except /a/b/.
inc = [p for p in prefixes if not p.startswith("!")]
exc = [p[1:] for p in prefixes if p.startswith("!")]
S = {n.name for n in nodes if any(n.name.startswith(p) for p in inc) and not any(n.name.startswith(p) for p in exc)}
inside_out = {o for n in nodes if n.name in S for o in n.output}
F16, F32 = TensorProto.FLOAT16, TensorProto.FLOAT

pre, new_inits, up = [], [], {}
def as_f32(name):
    if name not in up:
        if name in inits:
            f = name + "_f32"
            new_inits.append(numpy_helper.from_array(numpy_helper.to_array(inits[name]).astype(np.float32), f))
        else:
            f = name + "_up_f32"
            pre.append(helper.make_node("Cast", [name], [f], to=F32, name=f))
        up[name] = f
    return up[name]

for n in nodes:
    if n.name not in S:
        continue
    for k, i in enumerate(n.input):
        if i and i not in inside_out and types.get(i) == F16:
            n.input[k] = as_f32(i)
    for a in n.attribute:
        if n.op_type == "Cast" and a.name == "to" and a.i == F16:
            a.i = F32
        if n.op_type in ("Constant", "ConstantOfShape") and a.name == "value" and a.t.data_type == F16:
            a.t.CopyFrom(numpy_helper.from_array(numpy_helper.to_array(a.t).astype(np.float32), a.t.name))

post, down = [], {}
for n in nodes:
    if n.name in S:
        continue
    for k, i in enumerate(n.input):
        if i in inside_out and types.get(i) == F16:
            if i not in down:
                d = i + "_down_f16"
                post.append((i, helper.make_node("Cast", [i], [d], to=F16, name=d)))
                down[i] = d
            n.input[k] = down[i]
# Graph outputs produced inside the set that were declared fp16 would now be fp32: none expected (waveform is fp32).
assert not any(o in inside_out and types.get(o) == F16 for o in graph_outputs)

# Order: input casts right before their first reader; output casts right after their producer.
order = []
pre_by_src = {}
for c in pre:
    pre_by_src[c.input[0]] = c
placed = set()
producer_of = {o: n.name for n in nodes for o in n.output}
post_after = {}
for src_name, c in post:
    post_after.setdefault(producer_of[src_name], []).append(c)
for n in nodes:
    for i in n.input:
        pass
    # casts whose source is ready: emit before the first node that reads the cast
    for i in n.input:
        for src_name, f in up.items():
            if i == f and src_name not in inits and f not in placed:
                order.append(pre_by_src[src_name]); placed.add(f)
    order.append(n)
    order.extend(post_after.get(n.name, []))
del g.node[:]
g.node.extend(order)
g.initializer.extend(new_inits)
del g.value_info[:]
# Drop weights nothing reads any more (the fp16 originals of the fp32 copies).
used = {i for n in g.node for i in n.input}
keep = [i for i in g.initializer if i.name in used]
del g.initializer[:]
g.initializer.extend(keep)
onnx.checker.check_model(m)
onnx.save(m, dst)
print(f"{len(S)} nodes in fp32, {len(pre)} casts up, {len(post)} casts down, {len(new_inits)} fp32 weight copies; "
      f"size {os.path.getsize(dst) / 1e6:.1f} MB")
