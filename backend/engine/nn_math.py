def _mulberry32(seed: int):
    """Bit-for-bit port of mulberry32 in src/lib/execution-helpers.ts, so a
    Dense Layer's weight web is identical in the live preview and the /run
    engine. Change one and you must change both."""
    a = int(seed) & 0xFFFFFFFF

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = (((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t) & 0xFFFFFFFF
        return (t ^ (t >> 14)) / 4294967296

    return rand


def _generate_weights(seed: int, input_size: int, neurons: int):
    """weights[neuron][input] in [-1, 1) — same generation order as the TS
    generateWeights so both sides produce the same matrix."""
    rand = _mulberry32(seed)
    return [[rand() * 2 - 1 for _ in range(input_size)] for _ in range(neurons)]


def _conv1d_output_positions(input_len: int, kernel_size: int, stride: int) -> int:
    if input_len < kernel_size or kernel_size < 1 or stride < 1:
        return 0
    return (input_len - kernel_size) // stride + 1


def _conv1d_forward(values, seed, kernel_size, filters, stride, activation):
    """Bit-for-bit port of conv1dForward in src/lib/execution-helpers.ts —
    each filter's kernel slides across `values`, so every output only depends
    on a local window, not the whole input (unlike a Dense Layer)."""
    import math
    positions = _conv1d_output_positions(len(values), kernel_size, stride)
    if positions == 0:
        return []
    kernels = _generate_weights(seed, kernel_size, filters)  # kernels[f][k]
    out = []
    for f in range(filters):
        for p in range(positions):
            z = sum(kernels[f][k] * values[p * stride + k] for k in range(kernel_size))
            z = max(-60.0, min(60.0, z))
            if activation == "sigmoid":
                out.append(1.0 / (1.0 + math.exp(-z)))
            elif activation == "tanh":
                out.append(math.tanh(z))
            else:
                out.append(max(0.0, z))  # relu
    return out


def _to_number_vector(v) -> list:
    if not isinstance(v, list):
        return []
    out = []
    for x in v:
        try:
            out.append(float(x))
        except (TypeError, ValueError):
            out.append(0.0)
    return out
