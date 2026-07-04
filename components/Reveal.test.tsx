import React from 'react'
import { render, screen, waitFor, act } from '@testing-library/react'
import Reveal from './Reveal'

describe('Reveal', () => {
  let savedIntersectionObserver: typeof IntersectionObserver | undefined
  let observerCallback: IntersectionObserverCallback | null = null
  let mockObserverInstance: {
    observe: jest.Mock
    disconnect: jest.Mock
  } | null = null

  beforeEach(() => {
    // Save the original IntersectionObserver
    savedIntersectionObserver = global.IntersectionObserver

    // Reset callback and mock instance for each test
    observerCallback = null
    mockObserverInstance = null
  })

  afterEach(() => {
    // Restore the original IntersectionObserver
    if (savedIntersectionObserver) {
      global.IntersectionObserver = savedIntersectionObserver
    }

    // Clean up state for next test
    observerCallback = null
    mockObserverInstance = null
  })

  describe('basic rendering', () => {
    it('should render children', () => {
      render(
        <Reveal>
          <div data-testid="child">Child content</div>
        </Reveal>
      )
      expect(screen.getByTestId('child')).toBeInTheDocument()
      expect(screen.getByText('Child content')).toBeInTheDocument()
    })

    it('should apply default variant class "reveal"', () => {
      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )
      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal')
    })

    it('should apply variant="fade" as class "reveal-soft"', () => {
      const { container } = render(
        <Reveal variant="fade">
          <div>Content</div>
        </Reveal>
      )
      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal-soft')
      expect(wrapper).not.toHaveClass('reveal')
    })

    it('should apply custom className in addition to base class', () => {
      const { container } = render(
        <Reveal className="custom-class">
          <div>Content</div>
        </Reveal>
      )
      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal')
      expect(wrapper).toHaveClass('custom-class')
    })

    it('should apply custom className with fade variant', () => {
      const { container } = render(
        <Reveal variant="fade" className="custom-fade">
          <div>Content</div>
        </Reveal>
      )
      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal-soft')
      expect(wrapper).toHaveClass('custom-fade')
    })
  })

  describe('prefers-reduced-motion', () => {
    it('should immediately show content when prefers-reduced-motion is set', async () => {
      // Mock window.matchMedia to return matches: true
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })

      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      // Should have is-visible class immediately
      await waitFor(() => {
        expect(wrapper).toHaveClass('is-visible')
      })
    })
  })

  describe('IntersectionObserver degradation', () => {
    it('should immediately show content when IntersectionObserver is undefined', async () => {
      // Temporarily remove IntersectionObserver
      const originalIO = global.IntersectionObserver
      delete (global as unknown as Record<string, unknown>).IntersectionObserver

      // Ensure matchMedia returns false so it doesn't interfere
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })

      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      // Should have is-visible class immediately
      await waitFor(() => {
        expect(wrapper).toHaveClass('is-visible')
      })

      // Restore for other tests
      global.IntersectionObserver = originalIO
    })
  })

  describe('IntersectionObserver integration', () => {
    beforeEach(() => {
      // Ensure matchMedia returns false so it doesn't interfere
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })

      // Set up a custom IntersectionObserver mock that we can control
      mockObserverInstance = {
        observe: jest.fn(),
        disconnect: jest.fn(),
      }

      const MockIntersectionObserver = jest.fn((callback) => {
        observerCallback = callback
        return mockObserverInstance
      })

      global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
    })

    it('should not have is-visible class initially', () => {
      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      expect(wrapper).not.toHaveClass('is-visible')
    })

    it('should add is-visible class when observer fires with isIntersecting=true', async () => {
      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      expect(wrapper).not.toHaveClass('is-visible')

      // Simulate intersection
      if (observerCallback) {
        await act(async () => {
          observerCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
        })
      }

      await waitFor(() => {
        expect(wrapper).toHaveClass('is-visible')
      })
    })

    it('should call observer.disconnect() after intersection is detected', async () => {
      render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      // Simulate intersection
      if (observerCallback && mockObserverInstance) {
        await act(async () => {
          observerCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
        })
        await waitFor(() => {
          expect(mockObserverInstance!.disconnect).toHaveBeenCalled()
        })
      }
    })

    it('should not add is-visible when observer fires with isIntersecting=false', async () => {
      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')

      // Simulate non-intersection
      if (observerCallback) {
        await act(async () => {
          observerCallback!([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
        })
      }

      // Wait a bit to ensure no state change happens
      await new Promise((resolve) => setTimeout(resolve, 50))

      expect(wrapper).not.toHaveClass('is-visible')
    })

    it('should observe the wrapper element', () => {
      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')

      expect(mockObserverInstance?.observe).toHaveBeenCalledWith(wrapper)
    })

    it('should disconnect observer on unmount', () => {
      const { unmount } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      unmount()

      expect(mockObserverInstance?.disconnect).toHaveBeenCalled()
    })

    it('should handle multiple re-renders without re-creating observer', () => {
      const { rerender } = render(
        <Reveal>
          <div>Content 1</div>
        </Reveal>
      )

      const firstCallCount = (global.IntersectionObserver as jest.Mock).mock.calls.length

      rerender(
        <Reveal>
          <div>Content 2</div>
        </Reveal>
      )

      // IntersectionObserver constructor should not have been called again
      const secondCallCount = (global.IntersectionObserver as jest.Mock).mock.calls.length
      expect(secondCallCount).toBe(firstCallCount)
    })
  })

  describe('edge cases', () => {
    it('should handle multiple children', () => {
      const { container } = render(
        <Reveal>
          <div data-testid="child1">Child 1</div>
          <div data-testid="child2">Child 2</div>
        </Reveal>
      )

      expect(screen.getByTestId('child1')).toBeInTheDocument()
      expect(screen.getByTestId('child2')).toBeInTheDocument()
    })

    it('should handle empty className', () => {
      const { container } = render(
        <Reveal className="">
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal')
      // Empty string should not produce extra spaces
      expect(wrapper?.className).toBe('reveal')
    })

    it('should handle multiple space-separated classNames', () => {
      const { container } = render(
        <Reveal className="class1 class2 class3">
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal')
      expect(wrapper).toHaveClass('class1')
      expect(wrapper).toHaveClass('class2')
      expect(wrapper).toHaveClass('class3')
    })
  })

  describe('variant combinations', () => {
    it('should respect variant="rise" explicitly', () => {
      const { container } = render(
        <Reveal variant="rise">
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')
      expect(wrapper).toHaveClass('reveal')
      expect(wrapper).not.toHaveClass('reveal-soft')
    })

    it('should support all valid variants', () => {
      const { container: riseContainer } = render(
        <Reveal variant="rise">
          <div>Content</div>
        </Reveal>
      )

      const { container: fadeContainer } = render(
        <Reveal variant="fade">
          <div>Content</div>
        </Reveal>
      )

      expect(riseContainer.querySelector('div')).toHaveClass('reveal')
      expect(fadeContainer.querySelector('div')).toHaveClass('reveal-soft')
    })
  })

  describe('complex scenarios', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })

      mockObserverInstance = {
        observe: jest.fn(),
        disconnect: jest.fn(),
      }

      const MockIntersectionObserver = jest.fn((callback) => {
        observerCallback = callback
        return mockObserverInstance
      })

      global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
    })

    it('should combine prefers-reduced-motion and IntersectionObserver check', async () => {
      // When prefers-reduced-motion is set, it should take precedence
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation((query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      })

      const { container } = render(
        <Reveal>
          <div>Content</div>
        </Reveal>
      )

      const wrapper = container.querySelector('div')

      // Should show immediately without using observer
      await waitFor(() => {
        expect(wrapper).toHaveClass('is-visible')
      })

      // Observer should not be called at all
      expect(mockObserverInstance?.observe).not.toHaveBeenCalled()
    })

    it('should work with complex nested structures', () => {
      render(
        <Reveal className="outer">
          <section>
            <h2>Title</h2>
            <article>
              <p>Paragraph text</p>
              <ul>
                <li>Item 1</li>
                <li>Item 2</li>
              </ul>
            </article>
          </section>
        </Reveal>
      )

      expect(screen.getByText('Title')).toBeInTheDocument()
      expect(screen.getByText('Paragraph text')).toBeInTheDocument()
      expect(screen.getByText('Item 1')).toBeInTheDocument()
    })
  })
})
