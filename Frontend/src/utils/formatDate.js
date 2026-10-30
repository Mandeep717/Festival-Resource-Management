export function formatDate(value, options = { dateStyle: "medium" }) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not set" : new Intl.DateTimeFormat(undefined, options).format(date);
}
