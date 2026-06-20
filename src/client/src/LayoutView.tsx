import { TerminalPane } from "./TerminalPane";
import type { LayoutNode, MachineStatus, PaneState, SplitDirection, SurfaceTab, TerminalMedia } from "./types";

interface Props {
  tab: SurfaceTab;
  machines: MachineStatus[];
  splitMachineId: string;
  terminalFontSize: number;
  unreadByPaneId: Map<string, number>;
  mediaByPaneId: Map<string, TerminalMedia[]>;
  onActivatePane: (paneId: string) => void;
  onSplit: (paneId: string, direction: SplitDirection, machineId: string) => void;
  onClosePane: (paneId: string) => void;
  onDismissMedia: (mediaId: string) => void;
}

export function LayoutView({
  tab,
  machines,
  splitMachineId,
  terminalFontSize,
  unreadByPaneId,
  mediaByPaneId,
  onActivatePane,
  onSplit,
  onClosePane,
  onDismissMedia,
}: Props) {
  const paneById = new Map(tab.panes.map((pane) => [pane.id, pane]));

  const renderNode = (node: LayoutNode) => {
    if (node.type === "pane") {
      const pane = paneById.get(node.paneId) as PaneState | undefined;
      if (!pane) return <div className="missing-pane">Missing pane</div>;
      return (
        <TerminalPane
          key={pane.id}
          pane={pane}
          active={tab.activePaneId === pane.id}
          unreadCount={unreadByPaneId.get(pane.id) ?? 0}
          machines={machines}
          splitMachineId={splitMachineId}
          terminalFontSize={terminalFontSize}
          canClose={tab.panes.length > 1}
          mediaItems={mediaByPaneId.get(pane.id) ?? []}
          onActivate={() => onActivatePane(pane.id)}
          onSplit={(direction, machineId) => onSplit(pane.id, direction, machineId)}
          onClose={() => onClosePane(pane.id)}
          onDismissMedia={onDismissMedia}
        />
      );
    }

    return (
      <div className={`split ${node.direction}`} style={{ "--ratio": node.ratio } as React.CSSProperties}>
        <div className="split-child">{renderNode(node.first)}</div>
        <div className="split-child">{renderNode(node.second)}</div>
      </div>
    );
  };

  return <div className="layout-view">{renderNode(tab.layout)}</div>;
}
