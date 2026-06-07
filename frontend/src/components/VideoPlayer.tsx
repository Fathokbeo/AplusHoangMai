import ReactPlayer from 'react-player';

interface Props {
  url: string;
  type: 'youtube' | 'local' | 'url';
}

function getVideoUrl(url: string, type: string) {
  if (type === 'local') return `/uploads/videos/${url}`;
  return url;
}

export default function VideoPlayer({ url, type }: Props) {
  const src = getVideoUrl(url, type);

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
      <ReactPlayer
        src={src}
        width="100%"
        height="100%"
        controls
        style={{ display: 'block' }}
      />
    </div>
  );
}
