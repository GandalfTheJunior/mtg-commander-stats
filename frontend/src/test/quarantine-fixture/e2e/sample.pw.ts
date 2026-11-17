// Sample titles for the quarantine filter test; listed only, never executed.
import { test } from '@playwright/test'

test('target', () => {})
test('unrelated prefix target', () => {})
test('target and more', () => {})
test('control', () => {})
test('tagged target @slow', () => {})
test.describe('group', () => {
  test('target', () => {})
  test.describe('inner group', () => {
    test('target', () => {})
  })
})
