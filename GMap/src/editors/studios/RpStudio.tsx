import { RpChat } from "../RpChat";

export function RpStudio() {
  return (
    <div className="studio-layout studio-layout--full">
      <div className="studio-full-container">
        <header className="studio-workspace-header" style={{ borderBottom: "1px solid var(--line-hairline)" }}>
          <div className="studio-title-group">
            <span className="studio-hero-icon">📜</span>
            <div>
              <h3 style={{ margin: 0 }}>Ролевой стол & Хроники кампании (RP Desk)</h3>
              <p className="hint">
                Эпизоды, сюжетные ветки, каналы фракций, маски NPC, дайс-пул и реплики мастера
              </p>
            </div>
          </div>
        </header>

        <div className="studio-full-body" style={{ background: "var(--surface-base, #0b1120)" }}>
          <RpChat />
        </div>
      </div>
    </div>
  );
}
