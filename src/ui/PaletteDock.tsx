import React from "react";

export default function PaletteDock({
  colors,
  onPick,
}: {
  colors: { name: string; hex: string }[];
  onPick: (hex: string) => void;
}) {
  return (
    <div className="dock palette-dock panel" style={{ maxWidth: 420 }}>
      <div className="panel-heading">Palette</div>
      <div className="palette-row">
        {colors.map((c) => (
          <button
            key={c.hex}
            className="swatch"
            title={c.name}
            style={{ backgroundColor: c.hex }}
            onClick={() => onPick(c.hex)}
          />
        ))}
      </div>
    </div>
  );
}
