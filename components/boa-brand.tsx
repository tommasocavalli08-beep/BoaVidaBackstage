import Image from 'next/image';
export function BoaBrand({caption = 'BACKSTAGE'}: {caption?: string}) {
  return <div className="brand">
    <Image unoptimized className="brand-logo" src="/brand/boavida-horizontal.svg" width={1423} height={716} alt="BoaVida" decoding="async" />
    <span className="brand-caption">{caption}</span>
  </div>;
}
