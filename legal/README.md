# Volunteer paperwork — drafting notes

Working drafts for Peace Academy of West Texas, a 501(c)(3) corporation
operating in Ector and Midland Counties, Texas.

**These are drafts. None of them should be put in front of a volunteer before a
Texas-licensed attorney has reviewed them.** That is not boilerplate caution.
Two of the rules below are ones that generic online templates get wrong in ways
that make the resulting document worse than having no document at all, because
it creates a false sense of protection.

---

## The two that matter most in Texas

### 1. A parent cannot sign away a child's right to sue

The single most common failure in volunteer paperwork is a "parental waiver"
purporting to release the organisation from liability for injuries to the
child. In Texas this is very likely unenforceable as to the **minor's own**
claims. *Munoz v. II Jaz Inc.*, 863 S.W.2d 207 (Tex. App.—Houston [14th Dist.]
1993), held that a parent's authority under the Family Code to make decisions
for a child does not extend to waiving the child's cause of action. Later
Texas decisions have not disturbed that reading.

So `05-guardian-consent.md` is **not** drafted as a waiver of the child's
claims. It does three things that are enforceable, and stops there:

- consent to the minor's participation, which the organisation genuinely needs;
- an acknowledgement of risk, which goes to assumption of risk and comparative
  responsibility rather than to a bar on suit;
- a release and indemnity of the **parent's own** claims, which a parent may
  give for themselves.

A document that promises more than this is not stronger. It is a document that
a court strikes, and whose overreach can colour how the rest is read.

**The real protection for minors is operational, not contractual:** liability
insurance that covers youth programming, two-adult supervision, screening of
anyone with unsupervised access to children, and an incident-reporting habit.

### 2. To be released from your own negligence, say so — conspicuously

Texas applies the **express negligence doctrine**: a release covering a party's
own negligence must state that intent in the four corners of the document, and
it must be **conspicuous** — larger type, bold, capitals, something that would
attract the attention of a reasonable person. *Dresser Industries, Inc. v.
Page Petroleum, Inc.*, 853 S.W.2d 505 (Tex. 1993).

This is why the negligence paragraph in `03-release-and-waiver.md` is in
capitals and boxed. It looks heavy-handed and it is supposed to. A release that
merely says "releases all claims of any kind" does not clear this bar, and the
whole clause fails.

**Where this lands in the UI:** the conspicuousness requirement is about what
the signer actually saw. Rendering that paragraph in the same grey body text as
everything else undoes the drafting. The onboarding screen must reproduce the
emphasis, and the signature record must store the hash of the exact text shown.

---

## The rest of the legal frame

**Texas Charitable Immunity and Liability Act** (Tex. Civ. Prac. & Rem. Code
ch. 84) limits the liability of volunteers of a charitable organisation, and
caps the organisation's own liability — but the organisation's protection is
conditioned on carrying liability insurance at the statutory minimums. Confirm
with the insurer that the policy in force meets them and that volunteer
activities and youth programming are within its scope. Without the policy, the
statutory cap is simply not available.

**Federal Volunteer Protection Act of 1997** (42 U.S.C. §14501 et seq.)
protects volunteers from liability for ordinary negligence within the scope of
their duties. It does not protect the organisation, and it does not reach wilful
or criminal misconduct, gross negligence, or harm caused while operating a
vehicle.

**Fair Labor Standards Act.** Volunteers must not displace paid staff or perform
the same work an employee is paid for, and must serve without expectation of
compensation. `02-volunteer-agreement.md` states this because an arrangement
that drifts can turn volunteers into employees owed back wages. Stipends,
gift cards and "thank-you" payments are where this usually goes wrong.

**Child abuse reporting.** Texas Family Code §261.101 requires *any person* who
suspects child abuse or neglect to report it within 48 hours — this is not
limited to professionals, and it cannot be delegated to a supervisor. The duty
is personal to whoever forms the suspicion. It is stated plainly in the code of
conduct for that reason.

**COPPA.** Collecting personal information online from a child under 13
triggers verifiable parental consent obligations. The simplest way to stay
clear of it: set a minimum age for self-registration in the portal at 13, and
have anyone younger enrolled by a parent through a form the parent submits.

**Right of publicity / media.** `04-media-consent.md` is drafted as revocable
going forward. A volunteer who withdraws consent cannot un-print a brochure
already distributed, and the document says so rather than promising otherwise.
Withdrawal should be honoured on the website and social accounts within a
stated period.

**Background screening.** Not drafted here, because what is appropriate depends
on the role and on the insurer's requirements. At minimum, anyone with
unsupervised access to minors should be screened, and the authorisation for
that is a separate document with its own FCRA obligations if a consumer
reporting agency is used. **Ask the attorney about this specifically.**

---

## Certificates of service

`volunteer_certificates` issues a record of hours, not an award. Three points
that affect the document itself:

- **No dollar value.** Do not print "value of service" on it. Volunteer time is
  not a deductible charitable contribution under IRS rules, and a document that
  assigns a dollar figure to donated hours invites someone to deduct it.
- **Court-ordered service is different.** A court usually wants the
  organisation's name and contact details, the dates and hours, a description
  of the work, and a signature from a named supervisor — sometimes notarised.
  If PAWTX accepts court-ordered placements, ask the attorney whether the
  standard certificate suffices or a separate form is needed.
- **Frozen at issue.** The stored totals are a snapshot. If hours are later
  corrected, the correct response is to revoke the certificate and issue a new
  one, not to let the old number quietly change.

---

## Electronic signature

Signatures are taken electronically under the federal ESIGN Act and the Texas
Uniform Electronic Transactions Act. Both require, in substance: the signer's
intent to sign, their consent to transact electronically, association of the
signature with the record, and retention of the record in a form that can be
reproduced.

The schema is built for that: `document_signatures` stores the typed name, the
role signed in, the timestamp, the IP and user agent, and the **hash of the
exact text** agreed to. What it deliberately does not do is let anyone update
or delete a signature afterwards, admins included.

---

## What to put in front of the attorney

Ordered by how much turns on the answer.

1. **`03-release-and-waiver.md`** — the negligence clause, its conspicuousness,
   and whether the scope is right for the activities actually run.
2. **`05-guardian-consent.md`** — confirm the framing above is right, and ask
   what, if anything, is worth adding for minors given that a pre-injury waiver
   is not available.
3. **Insurance against ch. 84.** Not a document question but the one with the
   largest exposure attached. Bring the policy.
4. **Background screening** for youth roles — whether it is required, by whom,
   and what the authorisation form must say.
5. **Court-ordered community service** — whether PAWTX accepts it and what the
   local courts require.
6. **Data retention.** How long to keep applications, signatures, emergency
   contacts and dates of birth, and what to purge. Nothing in this schema
   deletes anything yet.
7. **Whether an incident report form is needed** — it is not drafted here, and
   for a youth-serving organisation it usually should exist.

## What is deliberately not in these drafts

Confidentiality and conflict-of-interest policies, a whistleblower policy, a
document-retention policy, driver authorisation and MVR checks, and an incident
report form. Several of these are separate IRS Form 990 governance questions
rather than volunteer paperwork, and drafting them alongside would blur what
each document is for.
