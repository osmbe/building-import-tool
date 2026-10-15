import { fetchDataDates } from '../../utils/dataDates'
import { queryGrb } from '../../utils/db'

// When each official dataset was last imported (Issue #59).
export default defineEventHandler(async () => {
  return await fetchDataDates((sql) => queryGrb(sql))
})
