# Math

← [Back to test suite](test.md)

Inline and block LaTeX via MathJax → SVG. Hover a block equation for **Copy SVG**, or run the
"Copy Equation as SVG" command with your cursor in any equation.

---

## Inline

Euler's identity $e^{i\pi} + 1 = 0$ sits inside a sentence. The Pythagorean theorem is
$a^2 + b^2 = c^2$, and a fraction like $\frac{p}{q}$ renders inline at text size.

Currency stays plain text: it cost $5 and then $10 more — not math.

Multiple per line: $\alpha$, $\beta$, and $\gamma$ each reveal independently on cursor entry.

---

## Block ($$)

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

Single-line block on its own line:

$$\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}$$

---

## Fenced (```math)

```math
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
\begin{pmatrix} x \\ y \end{pmatrix}
=
\begin{pmatrix} ax + by \\ cx + dy \end{pmatrix}
```

---

## Error handling

Invalid LaTeX renders MathJax's own error rather than crashing: $\frac{1}{$ (unbalanced braces).
