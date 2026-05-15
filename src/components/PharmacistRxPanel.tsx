"use client";

type Rx = {
  id: number;
  drugName: string;
  indication: string;
  dosage: string;
  duration: string;
  dispensedOn: string | null;
  patientFeedback: string;
  sideEffectsObserved: string;
  pharmacistReply: string;
};

type Props = {
  prescriptions: Rx[];
  onSaveReply: (prescriptionId: number, pharmacistReply: string) => Promise<void>;
  onRemove: (prescriptionId: number) => Promise<void>;
};

export function PharmacistRxPanel({ prescriptions, onSaveReply, onRemove }: Props) {
  if (prescriptions.length === 0) {
    return <p className="muted">No medications listed yet for this patient.</p>;
  }

  return (
    <div className="med-list">
      {prescriptions.map((m) => (
        <article key={m.id} className="med-card">
          <h3>{m.drugName}</h3>
          <p className="muted" style={{ margin: "0 0 0.5rem", fontSize: "0.85rem" }}>
            {m.indication} · {m.dosage} · {m.duration}
            {m.dispensedOn ? ` · Dispensed ${m.dispensedOn}` : ""}
          </p>
          <div className="muted" style={{ fontSize: "0.88rem", marginBottom: "0.5rem" }}>
            <strong>Patient feedback:</strong> {m.patientFeedback || "—"}
          </div>
          <div className="muted" style={{ fontSize: "0.88rem", marginBottom: "0.75rem" }}>
            <strong>Side effects reported:</strong> {m.sideEffectsObserved || "—"}
          </div>
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await onSaveReply(m.id, String(fd.get("pharmacistReply") || ""));
            }}
          >
            <div>
              <label htmlFor={`reply-${m.id}`}>Your reply to this feedback</label>
              <textarea
                id={`reply-${m.id}`}
                name="pharmacistReply"
                rows={3}
                placeholder="Respond to the patient's questions or concerns…"
                defaultValue={m.pharmacistReply || ""}
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Save reply
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (confirm("Remove this medication record from the patient portal?")) {
                    void onRemove(m.id);
                  }
                }}
              >
                Remove record
              </button>
            </div>
          </form>
        </article>
      ))}
    </div>
  );
}
