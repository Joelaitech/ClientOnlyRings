import React from 'react';

/** Swatch fills for the three metal options. */
const SWATCH = {
  yellowGold: 'linear-gradient(145deg,#F7DC91,#E0A526 55%,#B8841A)',
  whiteGold: 'linear-gradient(145deg,#FFFFFF,#DCDCDA 55%,#AFAFAE)',
  roseGold: 'linear-gradient(145deg,#F5C6AE,#DE9877 55%,#B06B4C)',
};

function Row({ label, value, children }) {
  return (
    <div className="row">
      <div className="row-head">
        <label>{label}</label>
        <span className="value">{value}</span>
      </div>
      {children}
    </div>
  );
}

export default function Controls({
  profile, standards, configure, rings, onSelectRing, config, resolved, warnings, onChange,
}) {
  // This ring's OWN copy of standards/configure — not a shared module.
  const { RING_SIZE, CARAT, SHANK_WIDTH, METALS } = standards;
  const { defaultConfig } = configure;
  const { ringSize, carat, shankWidth, metal } = config;

  /** Per-ring carat bounds, falling back to the catalogue range. */
  const caratMin = profile.master.caratMin ?? CARAT.MIN;
  const caratMax = profile.master.caratMax ?? CARAT.MAX;
  const master = profile.master;

  return (
    <aside className="panel">
      <header>
        <h1>Ring Builder</h1>
        <p>{profile.sku} · {profile.description}</p>
      </header>

      {/* Only worth showing once there is a choice to make. */}
      {rings.length > 1 && (
        <Row label="Model" value={profile.name}>
          <select
            className="picker"
            value={profile.id}
            onChange={(e) => onSelectRing(e.target.value)}
          >
            {rings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.sku} — {r.name}
              </option>
            ))}
          </select>
        </Row>
      )}

      {/* ---- METAL ---- */}
      <Row label="Metal" value={METALS[metal].label}>
        <div className="metals">
          {Object.values(METALS).map((m) => (
            <button
              key={m.id}
              className={`swatch${metal === m.id ? ' on' : ''}`}
              style={{ background: SWATCH[m.id] }}
              onClick={() => onChange({ metal: m.id })}
              title={m.label}
              aria-label={m.label}
              aria-pressed={metal === m.id}
            />
          ))}
        </div>
      </Row>

      {/* ---- RING SIZE ---- */}
      <Row label="Ring Size" value={`US ${ringSize.toFixed(1)}`}>
        <input
          type="range"
          min={RING_SIZE.MIN}
          max={RING_SIZE.MAX}
          step={RING_SIZE.STEP}
          value={ringSize}
          onChange={(e) => onChange({ ringSize: parseFloat(e.target.value) })}
        />
        <div className="scale">
          <span>US {RING_SIZE.MIN}</span>
          <span className="mid">
            {resolved.shank.innerDiameter.toFixed(2)} mm ID ·{' '}
            {resolved.shank.circumference.toFixed(1)} mm
          </span>
          <span>US {RING_SIZE.MAX}</span>
        </div>
      </Row>

      {/* ---- SHANK WIDTH ---- */}
      <Row label="Band Width" value={`${shankWidth.toFixed(2)} mm`}>
        <input
          type="range"
          min={SHANK_WIDTH.MIN}
          max={SHANK_WIDTH.MAX}
          step={SHANK_WIDTH.STEP}
          value={shankWidth}
          onChange={(e) => onChange({ shankWidth: parseFloat(e.target.value) })}
        />
        <div className="scale">
          <span>{SHANK_WIDTH.MIN} mm</span>
          <span className="mid">
            {shankWidth === master.shankWidthMM
              ? 'As modelled'
              : `${resolved.shank.widthScale.toFixed(2)}× master`}
          </span>
          <span>{SHANK_WIDTH.MAX} mm</span>
        </div>
      </Row>

      {/* ---- CARAT ----
           Bounds are per-ring: an elongated stone or a heavy master mount
           cannot span the full catalogue range without the head detaching or
           the stone cantilevering off the band. See the profiles. */}
      <Row label="Center Stone" value={`${carat.toFixed(2)} ct`}>
        <input
          type="range"
          min={caratMin}
          max={caratMax}
          step={CARAT.STEP}
          value={carat}
          onChange={(e) => onChange({ carat: parseFloat(e.target.value) })}
        />
        <div className="scale">
          <span>{caratMin} ct</span>
          <span className="mid">
            {resolved.stone.cut} · {resolved.stone.mm.toFixed(2)} mm
          </span>
          <span>{caratMax} ct</span>
        </div>
      </Row>

      {/* ---- WARNINGS ---- */}
      {warnings.length > 0 && (
        <div className="warn">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {/* ---- SPEC READOUT ---- */}
      <div className="spec">
        <h2>Specification</h2>
        <dl>
          <dt>Center stone</dt>
          <dd>
            {resolved.stone.carat.toFixed(2)} ct {resolved.stone.cut} ·{' '}
            {resolved.stone.mm.toFixed(2)} mm
          </dd>

          {resolved.accents && (
            <>
              <dt>Side stones</dt>
              <dd>
                {resolved.accents.perSide
                  ? `${resolved.accents.perSide} per side · `
                  : `${resolved.accents.count} × `}
                {resolved.accents.mm} mm ·{' '}
                {resolved.accents.totalCarat.toFixed(2)} ct
              </dd>
            </>
          )}

          {/* Only the oval carries these — decorative accents under the head,
              counted apart from the side stones so the totals stay honest. */}
          {resolved.gallery && (
            <>
              <dt>Gallery accents</dt>
              <dd>
                {resolved.gallery.count} × {resolved.gallery.sizes.join('/')} mm ·{' '}
                {resolved.gallery.totalCarat.toFixed(2)} ct
              </dd>
            </>
          )}

          <dt>Total carat</dt>
          <dd>{resolved.totalCarat.toFixed(2)} ct</dd>

          <dt>Metal</dt>
          <dd>{resolved.material.label}</dd>

          <dt>Inner diameter</dt>
          <dd>{resolved.shank.innerDiameter.toFixed(2)} mm</dd>

          <dt>Band</dt>
          <dd>{resolved.shank.widthMM.toFixed(2)} mm wide</dd>
        </dl>
      </div>

      <button className="reset" onClick={() => onChange(defaultConfig(profile))}>
        Reset to master
      </button>
    </aside>
  );
}
