import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from "react-resizable-panels";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Props = {
  mode: "prep" | "live";
  left: ReactNode;
  main: ReactNode;
  right: ReactNode;
  leftOpen: boolean;
  rightOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  onRightOpenChange: (open: boolean) => void;
  leftRailTitle: string;
  rightRailTitle: string;
};

/**
 * Horizontal dock: left tools | map | right inspector/live dock.
 * Sizes persist via useDefaultLayout; collapse ↔ rail via panel API.
 */
export function EditorShellLayout({
  mode,
  left,
  main,
  right,
  leftOpen,
  rightOpen,
  onLeftOpenChange,
  onRightOpenChange,
  leftRailTitle,
  rightRailTitle,
}: Props) {
  const layoutId = mode === "live" ? "gmap-editor-live" : "gmap-editor-prep";
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: layoutId,
    storage: localStorage,
    panelIds: ["left", "main", "right"],
  });

  const leftRef = usePanelRef();
  const rightRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(!leftOpen);
  const [rightCollapsed, setRightCollapsed] = useState(!rightOpen);
  const leftCollapsedRef = useRef(leftCollapsed);
  const rightCollapsedRef = useRef(rightCollapsed);
  leftCollapsedRef.current = leftCollapsed;
  rightCollapsedRef.current = rightCollapsed;

  const syncLeft = useCallback(
    (open: boolean) => {
      const p = leftRef.current;
      if (!p) return;
      if (open && p.isCollapsed()) p.expand();
      if (!open && !p.isCollapsed()) p.collapse();
    },
    [leftRef],
  );

  const syncRight = useCallback(
    (open: boolean) => {
      const p = rightRef.current;
      if (!p) return;
      if (open && p.isCollapsed()) p.expand();
      if (!open && !p.isCollapsed()) p.collapse();
    },
    [rightRef],
  );

  useEffect(() => {
    syncLeft(leftOpen);
  }, [leftOpen, syncLeft]);

  useEffect(() => {
    syncRight(rightOpen);
  }, [rightOpen, syncRight]);

  return (
    <Group
      id={layoutId}
      key={layoutId}
      orientation="horizontal"
      className="editor-shell-group"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel
        id="left"
        panelRef={leftRef}
        className="shell-panel shell-panel-left"
        collapsible
        collapsedSize="40px"
        minSize="160px"
        defaultSize={mode === "live" ? "200px" : "260px"}
        maxSize="42%"
        onResize={(size) => {
          const collapsed = size.inPixels <= 48;
          if (leftCollapsedRef.current !== collapsed) {
            setLeftCollapsed(collapsed);
            onLeftOpenChange(!collapsed);
          }
        }}
      >
        {leftCollapsed ? (
          <button
            type="button"
            className="panel-rail panel-rail-left shell-rail"
            title={leftRailTitle}
            onClick={() => {
              leftRef.current?.expand();
              onLeftOpenChange(true);
            }}
          >
            ⚙
          </button>
        ) : (
          left
        )}
      </Panel>

      <Separator className="shell-separator" />

      <Panel id="main" className="shell-panel shell-panel-main" minSize="30%">
        {main}
      </Panel>

      <Separator className="shell-separator" />

      <Panel
        id="right"
        panelRef={rightRef}
        className="shell-panel shell-panel-right"
        collapsible
        collapsedSize="40px"
        minSize="200px"
        defaultSize={mode === "live" ? "320px" : "300px"}
        maxSize="48%"
        onResize={(size) => {
          const collapsed = size.inPixels <= 48;
          if (rightCollapsedRef.current !== collapsed) {
            setRightCollapsed(collapsed);
            onRightOpenChange(!collapsed);
          }
        }}
      >
        {rightCollapsed ? (
          <button
            type="button"
            className="panel-rail panel-rail-right shell-rail"
            title={rightRailTitle}
            onClick={() => {
              rightRef.current?.expand();
              onRightOpenChange(true);
            }}
          >
            ▣
          </button>
        ) : (
          right
        )}
      </Panel>
    </Group>
  );
}
