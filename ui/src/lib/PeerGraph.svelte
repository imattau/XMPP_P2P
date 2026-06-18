<script>
  export let peers = []
</script>

<svg id="peer-graph" viewBox="0 0 280 180" role="img" aria-labelledby="peer-graph-title peer-graph-desc">
  <title id="peer-graph-title">Peer topology</title>
  <defs>
    <linearGradient id="graph-stroke" x1="0" x2="1">
      <stop offset="0%" stop-color="rgba(77, 226, 200, 0.75)" />
      <stop offset="100%" stop-color="rgba(173, 196, 220, 0.2)" />
    </linearGradient>
  </defs>
  <circle cx="140" cy="86" r="58" class="graph__ring" />
  {#each peers.filter((node) => node.kind !== 'local') as node}
    <line x1="140" y1="86" x2={node.x} y2={node.y}></line>
  {/each}
  {#each peers as node}
    <g transform={`translate(${node.x}, ${node.y})`}>
      <circle class="graph__halo" r={node.kind === 'local' ? 35 : node.kind === 'room' ? 27 : 24}></circle>
      <circle
        class="graph__node"
        r={node.kind === 'local' ? 26 : node.kind === 'room' ? 18 : 15}
        fill={node.kind === 'local'
          ? '#4de2c8'
          : node.kind === 'room'
            ? '#9db2c9'
            : node.status === 'busy'
              ? '#ff7f8a'
              : node.status === 'away'
                ? '#ffcc66'
                : '#7ff0dc'}
      ></circle>
      <text text-anchor="middle" dy="4">{node.label}</text>
    </g>
  {/each}
</svg>
