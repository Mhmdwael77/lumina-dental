import { Grain } from "./Grain";

/**
 * Swappable portrait: renders a real image when `src` is provided, otherwise a
 * clean, on-brand placeholder (gradient + monogram) that can be replaced later
 * by setting a path on the data (e.g. DOCTOR.image = "/images/doctor.jpg").
 */
export function Portrait({
  src,
  alt,
  monogram,
  className = "",
}: {
  src?: string | null;
  alt: string;
  monogram: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${alt} (placeholder)`}
      className={`relative h-full w-full ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(158deg, #ece6da 0%, #cdc4b2 62%, #a99f8c 100%)",
      }}
    >
      {/* soft studio light */}
      <div className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-white/35 blur-3xl" />
      {/* monogram */}
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-serif text-[7rem] font-medium leading-none text-ink/15 sm:text-[9rem]">
          {monogram}
        </span>
      </div>
      {/* seat + depth */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/30 via-transparent to-transparent" />
      <Grain opacity={0.1} />
    </div>
  );
}
