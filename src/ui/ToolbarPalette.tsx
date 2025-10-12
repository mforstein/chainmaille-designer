import React from "react";

/** Simple toolbar + palette with minimal styling */
export function Toolbar(props: {
  scale: number;
  rows: number;
  cols: number;
  onScaleChange: (n: number) => void;
  onRows: (n: number) => void;
  onCols: (n: number) => void;
  onFit: () => void;
  onCenter: () => void;
  onOneToOne: () => void;
  onReset: () => void;
  onPaintToggle: () => void;
  onEraseToggle: () => void;
  onPrint: () => void;
  paintOn: boolean;
  eraseOn: boolean;
  debug: boolean;
  setDebug: (b: boolean) => void;
}) {
  return (
    <div className="toolbar">
      <button onClick={props.onFit}>Fit</button>
      <button onClick={props.onCenter}>Center</button>
      <button onClick={props.onOneToOne}>1:1</button>
      <span className="sep" />
      <label>Zoom</label>
      <input
        type="range"
        min={0.1}
        max={3}
        step={0.01}
        value={props.scale}
        onChange={(e) => props.onScaleChange(parseFloat(e.target.value))}
      />
      <span className="val">{props.scale.toFixed(2)}×</span>
      <span className="sep" />
      <label>Rows</label>
      <input
        type="number"
        value={props.rows}
        onChange={(e) => props.onRows(parseInt(e.target.value || "1", 10))}
        className="num"
      />
      <label>Cols</label>
      <input
        type="number"
        value={props.cols}
        onChange={(e) => props.onCols(parseInt(e.target.value || "1", 10))}
        className="num"
      />
      <button onClick={props.onReset}>Reset</button>
      <span className="sep" />
      <button className={props.paintOn ? "on" : ""} onClick={props.onPaintToggle}>Paint</button>
      <button className={props.eraseOn ? "on" : ""} onClick={props.onEraseToggle}>Erase</button>
      <span className="sep" />
      <button onClick={props.onPrint}>Print 1:1</button>
      <span className="sep" />
      <label className="debug">
        <input
          type="checkbox"
          checked={props.debug}
          onChange={(e) => props.setDebug(e.target.checked)}
        />
        Debug
      </label>
    </div>
  );
}

export function Palette(props: {
  palette: { name: string; hex: string }[];
  current: string;
  onPick: (hex: string) => void;
}) {
  return (
    <div className="palette">
      <div className="palette-title">Palette</div>
      <div className="swatches">
        {props.palette.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            className={"swatch" + (props.current.toLowerCase() === c.hex.toLowerCase() ? " active" : "")}
            style={{ background: c.hex }}
            onClick={() => props.onPick(c.hex)}
          />
        ))}
      </div>
    </div>
  );
}