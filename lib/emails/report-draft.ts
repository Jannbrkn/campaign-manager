// lib/emails/report-draft.ts
// Generates a friendly, personal email draft for sending reports to manufacturer contacts.
// Style reference: warm, informal, always invites feedback, signed by Jann.

export interface ReportEmailDraft {
  subject: string
  body: string
}

export function generateReportEmailDraft(params: {
  contactPerson: string | null
  manufacturerName: string
  campaignTitle: string
}): ReportEmailDraft {
  const { contactPerson, manufacturerName, campaignTitle } = params

  // Parse multiple contacts like "Annika/Merlin" or "Karo, Max"
  const names = (contactPerson ?? '')
    .split(/[\/,&]/)
    .map((n) => n.trim())
    .filter(Boolean)
  const isMultiple = names.length > 1
  const firstName = names[0] ?? ''

  const salutation = isMultiple
    ? 'Hi ihr beiden,'
    : firstName
    ? `Hi ${firstName},`
    : 'Hallo,'

  // Day-aware greeting pool
  const dayOfWeek = new Date().getDay() // 0 = Sunday, 1 = Monday, ...
  const isMondayOrTuesday = dayOfWeek === 1 || dayOfWeek === 2

  const greetingsSingle = isMondayOrTuesday
    ? [
        'Ich hoffe du bist gut in die Woche gestartet!',
        'Ich hoffe du hattest einen guten Start in die Woche!',
        'Hoffentlich bist du gut in die Woche reingekommen!',
      ]
    : [
        'Ich hoffe du hattest einen schönen Tag!',
        'Ich hoffe es läuft bei dir alles gut!',
        'Ich hoffe du hattest eine gute Woche bisher!',
        'Hoffentlich ist bei dir alles bestens!',
      ]

  const greetingsMultiple = isMondayOrTuesday
    ? [
        'Ich hoffe ihr seid gut in die Woche gestartet.',
        'Ich hoffe ihr hattet beide einen guten Wochenstart!',
      ]
    : [
        'Ich hoffe es läuft bei euch beiden gut!',
        'Ich hoffe ihr hattet beide einen schönen Tag!',
      ]

  const greetingPool = isMultiple ? greetingsMultiple : greetingsSingle
  const greeting = greetingPool[Math.floor(Math.random() * greetingPool.length)]

  const attachmentLine = isMultiple
    ? 'Anbei findet ihr den internen Lead-Report sowie die externe Kampagnenauswertung'
    : 'Anbei findest du den internen Lead-Report sowie die externe Kampagnenauswertung'

  const feedbackLine = isMultiple
    ? 'Kommt gerne mit Anmerkungen oder Verbesserungsvorschlägen auf mich zu — ich passe das dann entsprechend an.'
    : 'Komm gerne mit Anmerkungen oder Verbesserungsvorschlägen auf mich zu — ich passe das dann entsprechend an.'

  const body = `${salutation}

${greeting}

${attachmentLine} für den ${campaignTitle}.

${feedbackLine}

Viele Grüße,
Jann`

  return {
    subject: `Report: ${campaignTitle} (${manufacturerName})`,
    body,
  }
}
