export const useLayersPanel = () => {
  const collapsed = useState<boolean>('layers-panel-collapsed', () => false)
  return { collapsed }
}
