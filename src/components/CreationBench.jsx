import { Eyedropper } from '@phosphor-icons/react'
import { useBenchStore } from '../store/benchStore.js'
import ToolWindow from './ToolWindow.jsx'
import ColorPickTool from '../modules/bench/ColorPickTool.jsx'

// Host for Creation Bench tools. Lives in the persistent shell so any tool can
// open over any screen. The store decides which (if any) is shown. (Frame
// Extract now lives inline on the canvas video player.)
const TOOLS = {
  colorPick: { title: 'Color Pick', subtitle: "Sample colours into a project's Skin", icon: Eyedropper, Body: ColorPickTool },
}

export default function CreationBench() {
  const tool = useBenchStore((s) => s.tool)
  const close = useBenchStore((s) => s.close)
  const def = tool ? TOOLS[tool] : null

  return (
    <ToolWindow
      open={!!def}
      onClose={close}
      title={def?.title}
      subtitle={def?.subtitle}
      icon={def?.icon}
    >
      {def && <def.Body />}
    </ToolWindow>
  )
}
