import * as React from 'react';
import { cn } from '@/lib/utils';
/** @type {React.ForwardRefRenderFunction<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement> & { fittingType?: string, originWidth?: number, originHeight?: number, focalPointX?: number, focalPointY?: number, quality?: number }>} */
const renderImage = ({ src, fittingType = 'fill', originWidth, originHeight, focalPointX, focalPointY, quality: _quality, className, style, onError, ...props }, ref) => {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return <img ref={ref} src={!src || failed ? '/media/placeholder.svg' : src} loading="lazy"
    className={cn(fittingType === 'fit' ? 'object-contain' : 'object-cover', className)}
    style={{ aspectRatio: originWidth && originHeight ? originWidth + '/' + originHeight : undefined,
      objectPosition: typeof focalPointX === 'number' && typeof focalPointY === 'number' ? (focalPointX * 100) + '% ' + (focalPointY * 100) + '%' : undefined, ...style }}
    onError={event => { if (!failed) setFailed(true); onError?.(event); }} {...props} />;
};
const Image = React.forwardRef(renderImage);
Image.displayName = 'Image';
export { Image };
