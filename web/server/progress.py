"""Progressive-overload math shared by the progress endpoints.

All comparisons happen in kilograms so lb and kg sets can be mixed; responses carry kg values
plus the unit the user last lifted in, and clients convert for display. Pure functions only,
so they are unit-tested without a database.
"""
KG_PER_LB = 0.45359237
# Smallest practical jumps: 5 lb (2.5 lb plates per side) or 2.5 kg (1.25 kg per side).
INCREMENT = {"lb": 5, "kg": 2.5}


def to_kg(weight, unit):
    return weight * KG_PER_LB if unit == "lb" else weight


def estimated_one_rep_max(weight_kg, reps):
    """Epley estimate; a single rep is the lift itself. Reliable mainly for roughly 1–12 reps."""
    return weight_kg if reps <= 1 else weight_kg * (1 + reps / 30)


def summarize_sets(sets):
    """Top set (heaviest, then most reps), volume, and best estimated 1RM for one session."""
    top = max(sets, key=lambda item: (to_kg(item["weight"], item["unit"]), item["reps"]))
    return {
        "topSet": {key: top[key] for key in ("reps", "weight", "unit")},
        "volumeKg": round(sum(to_kg(item["weight"], item["unit"]) * item["reps"] for item in sets), 2),
        "e1rmKg": round(max(estimated_one_rep_max(to_kg(item["weight"], item["unit"]), item["reps"]) for item in sets), 2),
        "maxReps": max(item["reps"] for item in sets),
    }


def suggest_next(sets):
    """Double progression from one session: add weight at the same reps, or one more rep.

    Based on the sets done at the session's top weight, so warm-ups do not count. Bodyweight
    work (weight 0) only gets the extra-rep option. The user chooses; nothing is applied
    automatically.
    """
    if not sets:
        return None
    top = summarize_sets(sets)["topSet"]
    working = [item for item in sets if item["weight"] == top["weight"] and item["unit"] == top["unit"]]
    reps = min(item["reps"] for item in working)
    options = []
    if top["weight"] > 0:
        options.append({"kind": "weight", "weight": round(top["weight"] + INCREMENT[top["unit"]], 2), "unit": top["unit"], "reps": reps, "sets": len(working)})
    options.append({"kind": "reps", "weight": top["weight"], "unit": top["unit"], "reps": min(reps + 1, 1000), "sets": len(working)})
    return {"same": {"weight": top["weight"], "unit": top["unit"], "reps": reps, "sets": len(working)}, "options": options}
