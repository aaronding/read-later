/** The logo, in its dark version wherever the app's dark colors apply (see globals.css). */
export function Logo({ size }: { size: number }) {
  return (
    <span className="logo">
      <img className="logo-light" src="/icons/logo.svg" alt="" width={size} height={size} />
      <img className="logo-dark" src="/icons/logo-dark.svg" alt="" width={size} height={size} />
    </span>
  );
}
