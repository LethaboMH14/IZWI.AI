import { Mark } from "@/components/Mark";
import "@/app/studio-room.css";

export default function StudioLoading() {
  return (
    <div className="studio-splash" role="status">
      <div className="splash-wave" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index} style={{ rotate: `${index * 15}deg`, animationDelay: `${index * -55}ms` }} />
        ))}
      </div>
      <div className="splash-content"><Mark /><p>Opening your Story Room…</p></div>
    </div>
  );
}
