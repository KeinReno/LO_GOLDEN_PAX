import { PolityEditor } from "../PolityEditor";

export function PolityStudio() {
  return (
    <div className="studio-layout studio-layout--full">
      <div className="studio-full-container">
        <div className="studio-full-body">
          <PolityEditor />
        </div>
      </div>
    </div>
  );
}
