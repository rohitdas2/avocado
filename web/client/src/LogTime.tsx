export default function LogTime({ value }: { value?: string }) {
  if (!value) return <span className="log-time">—</span>;
  const date = new Date(value);
  return <time className="log-time" dateTime={value} title={`Logged ${date.toLocaleString()}`}>{date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</time>;
}
