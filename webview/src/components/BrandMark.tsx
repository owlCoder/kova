import logo from '../../../assets/logo.png';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <span className={`kova-mark ${className}`} aria-hidden="true">
      <img src={logo} alt="" />
    </span>
  );
}
