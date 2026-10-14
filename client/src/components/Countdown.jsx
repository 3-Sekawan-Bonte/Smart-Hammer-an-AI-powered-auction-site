import { useEffect, useState } from 'react';

export default function Countdown({ endsAt, serverNow }) {
  const calculate = () => {
    const deadline = Date.parse(endsAt);
    if (!Number.isFinite(deadline)) return 0;
    const observedServerTime = Date.parse(serverNow);
    const serverOffset = Number.isFinite(observedServerTime) ? observedServerTime - Date.now() : 0;
    return Math.max(0, Math.ceil((deadline - (Date.now() + serverOffset)) / 1000));
  };
  const [seconds, setSeconds] = useState(calculate);

  useEffect(() => {
    setSeconds(calculate());
    const timer = window.setInterval(() => setSeconds(calculate()), 1000);
    return () => window.clearInterval(timer);
  }, [endsAt, serverNow]);

  const hours = Math.floor(seconds / 3600);
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');

  if (hours > 0) {
    return <span>{hours}j {minutes}m</span>;
  }
  return <span>{minutes}:{remainder}</span>;
}
