import { fetchDataDates } from '../../utils/dataDates'
import { queryGrb } from '../../utils/db'

// When each official dataset was last imported (Issue #59).
export default defineEventHandler(async () => fetchDataDates(async (sql) => queryGrb(sql)))
