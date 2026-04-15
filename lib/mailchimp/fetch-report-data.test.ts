// lib/mailchimp/fetch-report-data.test.ts
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateActivity } from './fetch-report-data'

describe('aggregateActivity', () => {
  test('aggregates opens and clicks per email', () => {
    const input = [
      {
        email_address: 'Anna@Firma.de',
        activity: [
          { action: 'open', timestamp: '2026-04-10T10:00:00Z' },
          { action: 'open', timestamp: '2026-04-10T11:00:00Z' },
          { action: 'click', timestamp: '2026-04-10T11:05:00Z' },
        ],
      },
      {
        email_address: 'bob@test.com',
        activity: [
          { action: 'open', timestamp: '2026-04-10T12:00:00Z' },
        ],
      },
    ]

    const result = aggregateActivity(input)
    const anna = result.find((r) => r.email === 'anna@firma.de')
    const bob = result.find((r) => r.email === 'bob@test.com')

    assert.ok(anna)
    assert.equal(anna.opens, 2)
    assert.equal(anna.clicks, 1)
    assert.ok(bob)
    assert.equal(bob.opens, 1)
    assert.equal(bob.clicks, 0)
  })

  test('deduplicates same email with multiple entries', () => {
    const input = [
      {
        email_address: 'test@test.com',
        activity: [{ action: 'open', timestamp: '2026-04-10T10:00:00Z' }],
      },
      {
        email_address: 'TEST@test.com',
        activity: [{ action: 'click', timestamp: '2026-04-10T11:00:00Z' }],
      },
    ]

    const result = aggregateActivity(input)
    assert.equal(result.length, 1)
    assert.equal(result[0].opens, 1)
    assert.equal(result[0].clicks, 1)
  })

  test('handles empty activity array', () => {
    const input = [
      { email_address: 'test@test.com', activity: [] },
    ]

    const result = aggregateActivity(input)
    assert.equal(result.length, 1)
    assert.equal(result[0].opens, 0)
    assert.equal(result[0].clicks, 0)
  })

  test('handles empty input', () => {
    const result = aggregateActivity([])
    assert.equal(result.length, 0)
  })
})
