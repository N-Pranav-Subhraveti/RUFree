import { useId } from "react";

// Use the runtime's IANA catalog so daylight-saving rules and zone names stay
// aligned with Intl/Temporal, rather than maintaining a small hand-picked list.
export function TimeZoneField({
  label,
  defaultValue,
}: {
  label: string;
  defaultValue: string;
}) {
  const id = useId();
  const zones = [
    ...new Set([
      "UTC",
      defaultValue,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...Intl.supportedValuesOf("timeZone"),
      // Some browser catalogs still list older spellings for these locations.
      ...[
        "Asia/Kolkata",
        "Asia/Kathmandu",
        "Europe/Kyiv",
        "America/Nuuk",
        "Asia/Yangon",
      ].filter((zone) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }),
    ]),
  ].sort();
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name="zone"
        required
        maxLength={100}
        defaultValue={defaultValue}
        list={`${id}-zones`}
        aria-describedby={`${id}-hint`}
        placeholder="Search by city or region"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          try {
            new Intl.DateTimeFormat("en", {
              timeZone: event.currentTarget.value,
            });
            event.currentTarget.setCustomValidity("");
          } catch {
            event.currentTarget.setCustomValidity(
              "Choose a time zone from the list, such as Africa/Nairobi.",
            );
          }
        }}
      />
      <datalist id={`${id}-zones`}>
        {zones.map((zone) => (
          <option key={zone} value={zone} label={zone.replaceAll("_", " ")} />
        ))}
      </datalist>
      <p className="fine" id={`${id}-hint`}>
        Search worldwide by city or region, such as Nairobi, London or Pacific.
        Daylight-saving changes follow the selected location.
      </p>
    </div>
  );
}
