import { describe, expect, it } from 'vitest'
import { lexicalScore } from './lexical'

/**
 * The lexical scorer is the only detector that runs for free, so it drives the
 * needle for every user who never adds a key. These pin the shape of its
 * output and the direction it moves, not exact magnitudes — the lexicon in
 * slop-lexicon.json is meant to be tuned without breaking the build.
 */
describe('lexicalScore', () => {
  it('scores empty input as exactly zero', () => {
    // Guards the words === 0 branch: the logistic would otherwise return ~0.04
    // for an empty window and park the needle off its rest position.
    expect(lexicalScore('')).toEqual({ score: 0, hitsPer100: 0, topHits: [] })
    expect(lexicalScore('   \n  ').score).toBe(0)
  })

  it('scores slop-free prose near the floor', () => {
    const clean = 'We fixed the bug on Tuesday and shipped it. The tests pass. Coffee helped.'
    const { score, hitsPer100, topHits } = lexicalScore(clean)
    expect(hitsPer100).toBe(0)
    expect(topHits).toEqual([])
    expect(score).toBeLessThan(0.1)
  })

  it('scores slop-dense prose far above clean prose', () => {
    const slop = "Let's delve into this rich tapestry, a testament to our journey."
    expect(lexicalScore(slop).score).toBeGreaterThan(lexicalScore('We shipped it today.').score)
  })

  it('reports hits per 100 words, so padding dilutes the same hit', () => {
    const filler = ' word'.repeat(100)
    const dense = lexicalScore('delve tapestry')
    const diluted = lexicalScore(`delve tapestry${filler}`)
    expect(dense.hitsPer100).toBeGreaterThan(diluted.hitsPer100)
    expect(diluted.score).toBeLessThan(dense.score)
  })

  it('weights multi-word constructions above single words', () => {
    // Patterns count double (lexical.ts), so a construction should outscore a
    // lone phrase hit in a window of comparable length.
    const pattern = lexicalScore("It's not hyperbole, it's arithmetic for everyone here today.")
    const phrase = lexicalScore('It is a tapestry of ideas presented to everyone here today.')
    expect(pattern.hitsPer100).toBeGreaterThan(phrase.hitsPer100)
  })

  it('ranks topHits by frequency and annotates repeats', () => {
    const { topHits } = lexicalScore('delve delve delve tapestry and more words here')
    expect(topHits[0]).toBe('delve×3')
    expect(topHits).toContain('tapestry')
    expect(topHits.length).toBeLessThanOrEqual(5)
  })

  it('is case-insensitive', () => {
    expect(lexicalScore('DELVE').hitsPer100).toBe(lexicalScore('delve').hitsPer100)
  })

  it('always returns a score inside 0..1', () => {
    const extreme = 'delve tapestry testament to '.repeat(50)
    const { score } = lexicalScore(extreme)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})
