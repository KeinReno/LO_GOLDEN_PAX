import { assignedLaborOf, buildingStaffedUnits, censusPerLaborUnit, consumesLabor, laborPopulation } from "../state/planetLabor";
import type { Planet, PlanetBuilding } from "../state/types";
import type { BuildingDef } from "./PlayerPlanetManage";

type Props = {
  planet: Planet;
  inst: PlanetBuilding;
  def: BuildingDef;
  catalog: Record<string, BuildingDef>;
  busy?: boolean;
  onStaff: (assignedLabor: number | null) => void;
};

export function BuildingLaborPanel({
  planet,
  inst,
  def,
  catalog,
  busy,
  onStaff,
}: Props) {
  if (!consumesLabor(def)) {
    return (
      <p className="hint planet-labor__note">
        Это здание не занимает рабочих.
      </p>
    );
  }

  const { staffed, slots, pinned, free } = buildingStaffedUnits(
    planet,
    inst,
    catalog,
  );
  const staffedN = Math.round(staffed);
  const pin = assignedLaborOf(inst);
  const labor = laborPopulation(planet);
  const per = censusPerLaborUnit();
  const census = planet.censusLocked === true || planet.population >= 10_000;
  const heads = (n: number) =>
    census ? ` ≈ ${Math.round(n * per).toLocaleString("ru-RU")} чел.` : "";
  const canAdd = !busy && slots > 0 && staffedN < slots && labor > 0;
  const canRemove = !busy && (staffedN > 0 || (pin != null && pin > 0));
  const nextPin = pin ?? staffedN;

  return (
    <section className="planet-labor" aria-label="Рабочие">
      <div className="planet-labor__row">
        <div>
          <div className="planet-labor__label">Рабочие</div>
          <div className="planet-labor__value">
            <strong className="planet-labor__num">
              {staffedN}/{slots}
            </strong>
            <span className="hint">
              {pinned ? "назначено" : "авто"}
              {heads(staffedN)}
            </span>
          </div>
        </div>
        <div className="planet-labor__btns">
          <button
            type="button"
            className="btn sm ghost"
            disabled={!canRemove}
            aria-label="Убрать работника"
            onClick={() => onStaff(Math.max(0, nextPin - 1))}
          >
            −
          </button>
          <button
            type="button"
            className="btn sm primary"
            disabled={!canAdd}
            aria-label="Назначить работника"
            onClick={() => onStaff(Math.min(slots, nextPin + 1))}
          >
            +
          </button>
        </div>
      </div>
      <p className="hint planet-labor__note">
        Свободно на планете: {Math.round(free)}
        {heads(free)}. «− / +» закрепляет число; [ ] на карточке — снять /
        назначить (Shift ×5). Остальные здания добирают остаток по очереди
        постройки.
      </p>
      {pinned ? (
        <button
          type="button"
          className="btn ghost sm"
          disabled={busy}
          onClick={() => onStaff(null)}
        >
          Снова авто
        </button>
      ) : null}
    </section>
  );
}
