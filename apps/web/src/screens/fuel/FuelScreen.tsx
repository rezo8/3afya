import { FuelPanel } from "./FuelPanel";

export function FuelScreen() {
  return (
    <>
      <div className="view-head">
        <p className="eyebrow">Fuel</p>
        <h1>Today</h1>
      </div>
      <FuelPanel />
    </>
  );
}
