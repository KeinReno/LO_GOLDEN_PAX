import { PolityEditor } from "../PolityEditor";

export function PolityStudio() {
  return (
    <div className="studio-layout studio-layout--full">
      <div className="studio-full-container">
        <header className="studio-workspace-header" style={{ borderBottom: "1px solid var(--line-hairline)" }}>
          <div className="studio-title-group">
            <span className="studio-hero-icon">🏛</span>
            <div>
              <h3 style={{ margin: 0 }}>Редактор государств & Держав</h3>
              <p className="hint">
                Управление фракциями, границами, дипломатическим статусом, геральдикой и профилями
              </p>
            </div>
          </div>
        </header>

        <div className="studio-full-body">
          <PolityEditor />
        </div>
      </div>
    </div>
  );
}
