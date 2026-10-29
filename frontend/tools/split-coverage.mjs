import { appendFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createCoverageMap } from '@vitest/istanbul-lib-coverage'
import { create, createContext, ReportBase } from '@vitest/istanbul-lib-report'

// Partition one complete Vitest coverage map, including its uncovered modules.
// Never emit an aggregate app + playground percentage.
export default class SplitCoverage extends ReportBase {
  constructor({ projectRoot }) {
    super()
    this.projectRoot = projectRoot
    this.maps = { app: createCoverageMap({}), playground: createCoverageMap({}) }
  }

  onDetail(node) {
    const file = node.getFileCoverage()
    const path = relative(join(this.projectRoot, 'src'), file.path)
    if (path.startsWith(`..${sep}`)) throw new Error(`Unexpected coverage source: ${file.path}`)
    this.maps[path.startsWith(`playground${sep}`) ? 'playground' : 'app'].addFileCoverage(file)
  }

  onEnd(_root, context) {
    let summary = '### Frontend V8 coverage (Vitest only)\n\n'
    summary += '| Scope | Files | Lines | Branches | Functions |\n| --- | ---: | --- | --- | --- |\n'
    for (const [scope, coverageMap] of Object.entries(this.maps)) {
      if (!coverageMap.files().length) throw new Error(`Empty coverage scope: ${scope}`)
      const scopedContext = createContext({ dir: join(context.dir, scope), coverageMap, sourceFinder: (path) => context.getSource(path) })
      for (const reporter of ['html', 'json', 'json-summary']) create(reporter).execute(scopedContext)
      const totals = coverageMap.getCoverageSummary()
      const metric = (name) => {
        const value = totals[name]
        return `${value.pct}% (${value.covered}/${value.total})`
      }
      summary += `| ${scope} | ${coverageMap.files().length} | ${metric('lines')} | ${metric('branches')} | ${metric('functions')} |\n`
    }
    summary += '\nApp: src/ except playground/; Playground: src/playground/. Includes untested executable modules; excludes tests, declarations and src/test/. No thresholds. Browser tests are separate.\n'
    console.log(summary)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  }
}
