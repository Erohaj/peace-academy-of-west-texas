# Volunteer Application

**Peace Academy of West Texas** — 3411 Brentwood Drive, Odessa, Texas 79762.

> **Draft — not for use until reviewed by a Texas-licensed attorney.**
>
> This is the field specification for the application form, and the notices
> that must appear on it. The fields map to `public.volunteer_applications`.

---

## Notice shown at the top of the form

> We ask for this information to place you in a role that suits you, to reach
> you about shifts, and to contact someone on your behalf if you are hurt while
> volunteering. **We do not sell it, and we do not share it outside Peace
> Academy of West Texas** except where the law requires.
>
> Applying does not commit you to anything. Nothing is scheduled until you
> choose a shift.

## Fields

### About you

| Field | Required | Notes |
|---|---|---|
| Full legal name | yes | As it should appear on a certificate of service |
| Email | yes | Also the sign-in address |
| Phone | no | |
| Date of birth | yes | Determines whether guardian consent is required. **Not** used for eligibility beyond that |
| Street address, city, state, ZIP | no | Asked because some grant reporting is by county |
| Preferred language | no | English / Spanish / other |

**Minimum age for self-registration is 13.** Someone younger is enrolled by a
parent, who completes the form on their behalf. This keeps the portal clear of
the verifiable-parental-consent obligations that COPPA attaches to collecting
personal information online from a child under 13.

### Emergency contact

| Field | Required |
|---|---|
| Name | yes |
| Phone | yes |
| Relationship to you | no |

Stated on the form: *"We will only use this if you are hurt or taken ill while
volunteering and we cannot reach you."*

### What you would like to do

| Field | Required | Notes |
|---|---|---|
| Areas of interest | no | Multi-select from the six volunteer roles |
| Skills and experience | no | Free text — languages spoken, food handling, first aid, driving, trades |
| Availability | no | Free text or day/time grid |
| Interested in youth programmes | no | Checkbox. **Screening applies before any unsupervised contact with minors — see the note below** |
| Why you would like to volunteer | no | Free text |

### What is deliberately not asked

- **Criminal history.** Not on the general application. Screening, where it is
  required, is a separate step with its own authorisation and its own FCRA
  obligations if a consumer reporting agency is used. Asking everyone on the
  first form is both unnecessary and a legal exposure of its own.
- **Immigration or citizenship status.** Irrelevant to volunteering and not the
  Organization's business.
- **Health conditions.** Only what someone chooses to disclose so their role can
  be made safe. Do not ask for a medical history.
- **Social security number.** Never, for a volunteer.

## Notice shown above the submit button

> Submitting this application does not make you a volunteer. We will review it
> and get in touch. Before your first shift you will be asked to read and sign
> the Volunteer Agreement, the Release and Waiver, and the Code of Conduct.
> Photo consent is separate, and optional.

## After submission

Status moves through `submitted → in_review → approved | declined`. A volunteer
may withdraw at any time (`withdrawn`).

Retention: **to be set by the attorney.** Applications, dates of birth and
emergency contacts should not be kept indefinitely, and nothing in the schema
purges them today.
