/**
 * Appens logo (V2): den ferdige emblem-logoen med kurv, glødende disc og skrift.
 * `md` brukes i toppfeltet, `lg` på innlogging og lasteskjermen. Bildet har gjennomsiktig bakgrunn og ligger i public/brand.
 */
const SRC = `${import.meta.env.BASE_URL}brand/logo.png`;

export function FancyDiscLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const cls = size === 'lg' ? 'h-48 w-auto' : 'h-12 w-auto';
  return (
    <img
      src={SRC}
      alt=""
      aria-hidden
      draggable={false}
      className={`shrink-0 select-none object-contain drop-shadow-[0_0_18px_rgba(34,211,238,0.35)] ${cls}`}
    />
  );
}
