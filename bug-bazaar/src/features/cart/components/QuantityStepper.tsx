import { useId, useState } from "react";

type QuantityStepperProps = {
  /** Used in accessible labels: "Quantity for Debug Duck #42". */
  productName: string;
  quantity: number;
  max: number;
  onChange: (quantity: number) => void;
};

/**
 * − [n] + control. The input keeps a local draft so typing "1" on the way to
 * "12" doesn't fight the user; the value is committed on blur or Enter. The
 * reducer still clamps it to 1…stock: this UI only helps, the store enforces.
 */
export default function QuantityStepper({
  productName,
  quantity,
  max,
  onChange,
}: QuantityStepperProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(quantity));
  const [synced, setSynced] = useState(quantity);
  if (quantity !== synced) {
    setSynced(quantity);
    setDraft(String(quantity));
  }

  function commit() {
    const value = Number.parseInt(draft, 10);
    if (Number.isFinite(value) && value >= 1) onChange(Math.min(value, max));
    else setDraft(String(quantity)); // empty or invalid: put the real value back
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__button"
        aria-label={`Decrease quantity of ${productName}`}
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 1}
      >
        −
      </button>
      <label htmlFor={id} className="visually-hidden">
        Quantity for {productName}
      </label>
      <input
        id={id}
        className="stepper__input"
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
        }}
      />
      <button
        type="button"
        className="stepper__button"
        aria-label={`Increase quantity of ${productName}`}
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= max}
      >
        +
      </button>
    </div>
  );
}
