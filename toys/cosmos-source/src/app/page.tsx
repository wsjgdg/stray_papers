'use client';

import dynamic from 'next/dynamic';

const CosmosViewer = dynamic(() => import('@/components/cosmos-viewer'), { ssr: false });

export default function Home() {
  return <CosmosViewer />;
}
