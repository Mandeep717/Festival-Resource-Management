export function formatDate(value, options = { dateStyle: "medium" }) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function toDateTimeLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function fromDateTimeLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
