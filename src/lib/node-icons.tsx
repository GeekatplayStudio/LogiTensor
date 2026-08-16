import React from "react";
import {
  Play, Hash, ToggleLeft, Type, AlignLeft, Clock, Sliders,
  Ampersand, Equal, Parentheses, CircleDot, Lock,
  Calculator, SquareFunction, Percent, Ruler, MoveHorizontal, Blend, ArrowLeftRight, Dices,
  Split, Merge, Scissors, FileJson, Binary, Quote, Regex, Search, CaseUpper, Filter,
  ListPlus, ListOrdered, Target, Sigma, ArrowUpDown, Crop,
  GitBranch, Timer, Repeat, Milestone, SkipForward, DoorOpen, CornerDownRight, Shuffle,
  Terminal, Gauge, CheckCheck, FileCode, Table2,
  Bot, Eye, Zap, Waypoints, Link2, TrendingUp, Activity,
  Grid3x3, Layers, Boxes, BookOpen,
} from "lucide-react";

// Per-node-type icons. The radial menu's outer ring and the sidebar both show
// these, so a node is recognizable by shape rather than only by reading its
// label — which matters now that the library is 70+ nodes deep.
// Unlisted types fall back to their category icon via `getNodeIcon`.
const NODE_ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  // Inputs
  triggerInput: Play,
  constNum: Hash,
  constBool: ToggleLeft,
  constString: Type,
  sliderInput: Sliders,
  textAreaInput: AlignLeft,
  currentTimeNode: Clock,

  // Logic
  andGate: Ampersand,
  orGate: Parentheses,
  notGate: CircleDot,
  xorGate: Equal,
  xnorGate: Equal,
  norGate: CircleDot,
  nandGate: Ampersand,
  toggleNode: ToggleLeft,
  latchNode: Lock,

  // Math & Compare
  compareNode: Equal,
  expressionNode: Parentheses,
  mathNode: Calculator,
  mathFunctionNode: SquareFunction,
  randomNode: Dices,
  clampNode: Ruler,
  mapRangeNode: MoveHorizontal,
  lerpNode: Blend,
  betweenNode: ArrowLeftRight,
  roundToNode: Percent,

  // Data & Text
  filterNode: Filter,
  stringOpNode: CaseUpper,
  replaceTextNode: Quote,
  splitTextNode: Split,
  joinTextNode: Merge,
  substringNode: Scissors,
  templateNode: FileCode,
  jsonParseNode: FileJson,
  jsonStringifyNode: FileJson,
  toNumberNode: Hash,
  toStringNode: Type,
  toBooleanNode: Binary,
  regexMatchNode: Regex,

  // Lists
  listAppendNode: ListPlus,
  listLengthNode: ListOrdered,
  listGetNode: Target,
  listStatsNode: Sigma,
  listSortNode: ArrowUpDown,
  listSliceNode: Crop,
  listContainsNode: Search,

  // Control Flow
  ifElseTrigger: GitBranch,
  condValue: Shuffle,
  delayNode: Timer,
  counterNode: Hash,
  rangeNode: ArrowLeftRight,
  forLoopNode: Repeat,
  whileLoopNode: Repeat,
  gateNode: DoorOpen,
  onceNode: Milestone,
  sequenceNode: SkipForward,

  // Outputs
  loggerNode: Terminal,
  textOutputNode: Table2,
  valueListNode: ListOrdered,
  gaugeNode: Gauge,
  assertNode: CheckCheck,

  // AI & Scripts
  pythonScript: FileCode,
  ollamaLLM: Bot,
  ollamaVLM: Eye,

  // Neural Network
  thresholdNeuron: Zap,
  maxSelectorNode: TrendingUp,
  synapseNode: Link2,
  leakyIntegrateFire: Activity,

  // AI Model
  imageInputGrid: Grid3x3,
  denseLayer: Layers,
  conv1dLayer: Boxes,
  outputLayerNode: BookOpen,
};

// Category fallbacks keep new node types usable before they get a bespoke icon.
const CATEGORY_FALLBACK: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  Inputs: Play,
  Logic: Ampersand,
  "Control Flow": GitBranch,
  "Math & Compare": Calculator,
  "Data & Text": Type,
  Lists: ListOrdered,
  Outputs: Terminal,
  "AI & Scripts": Bot,
  "Neural Network": Waypoints,
  "AI Model": Boxes,
};

/** Icon element for a node type, falling back to its category's icon. */
export function getNodeIcon(type: string, category: string, size = 12): React.ReactNode {
  const Icon = NODE_ICONS[type] ?? CATEGORY_FALLBACK[category] ?? CornerDownRight;
  return <Icon size={size} />;
}
