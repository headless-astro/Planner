<script lang="ts">
  import qrcode from 'qrcode-generator'

  // A QR code drawn as one SVG path. Always dark on white, in both themes, so cameras read it.
  let { text, label }: { text: string; label: string } = $props()

  /** The quiet zone around the code, in modules. */
  const MARGIN = 4

  const code = $derived.by(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const size = qr.getModuleCount()
    let path = ''
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) if (qr.isDark(row, col)) path += `M${col},${row}h1v1h-1z`
    }
    return { size, path }
  })
  const box = $derived(code.size + MARGIN * 2)
</script>

<svg class="qr" viewBox="{-MARGIN} {-MARGIN} {box} {box}" role="img" aria-label={label} shape-rendering="crispEdges">
  <rect x={-MARGIN} y={-MARGIN} width={box} height={box} fill="#ffffff" />
  <path d={code.path} fill="#000000" />
</svg>
