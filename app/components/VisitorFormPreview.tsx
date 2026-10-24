import { Panel, PreviewNote } from "./ui";

export function VisitorFormPreview() {
  return (
    <Panel
      title="Planned visit details"
      description="A compact, phone-friendly form layout."
      icon="calendar"
    >
      <form
        aria-label="Planned visitor details"
        className="preview-form"
      >
        <fieldset disabled>
          <label htmlFor="preview-visitor-name">
            Visitor name<input
              id="preview-visitor-name"
              name="visitor-name"
              type="text"
              autoComplete="off"
            />
          </label>
          <label htmlFor="preview-visit-date">
            Visit date<input
              id="preview-visit-date"
              name="visit-date"
              type="date"
            />
          </label>
          <div className="preview-form__time-row">
            <label htmlFor="preview-arrival">
              Planned arrival<input
                id="preview-arrival"
                name="arrival-time"
                type="time"
              />
            </label>
            <label htmlFor="preview-departure">
              Planned departure<input
                id="preview-departure"
                name="departure-time"
                type="time"
              />
            </label>
          </div>
        </fieldset>
        <div className="preview-form__footer">
          <PreviewNote>
            Visitor entry is unavailable.
          </PreviewNote>
        </div>
      </form>
    </Panel>
  );
}
