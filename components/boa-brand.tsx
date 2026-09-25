import Image from 'next/image';
export function BoaBrand({caption = 'BACKSTAGE'}: {caption?: string}) {
  return <div className="brand">
    <Image unoptimized className="brand-logo" src="/brand/boavida-horizontal.jpeg" width={1254} height={1254} alt="BoaVida" decoding="async" />
    <span className="brand-caption">{caption}</span>
  </div>;
}
