import { siAppstore, siYoutube, siInstagram, siGoogle, siTiktok, siX, siFacebook } from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';

function brand(icon: SimpleIcon) {
  function BrandIcon({ size = 21 }: { size?: number; strokeWidth?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill={`#${icon.hex}`}><path d={icon.path}/></svg>;
  }
  return BrandIcon;
}

export const AppStoreIcon = brand(siAppstore);
export const YouTubeIcon = brand(siYoutube);
export const InstagramIcon = brand(siInstagram);
export const GoogleIcon = brand(siGoogle);
export const TikTokIcon = brand(siTiktok);
export const XIcon = brand(siX);
export const FacebookIcon = brand(siFacebook);
