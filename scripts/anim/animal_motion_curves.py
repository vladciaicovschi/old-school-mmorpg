"""Small offline timing curves shared by the native quadruped authors."""
from __future__ import annotations

import math


def smoother(value):
    """Unit ramp with zero velocity and acceleration at both ends."""
    t = max(0.0, min(1.0, value))
    return t * t * t * (10 + t * (-15 + 6 * t))


def timing(value, incoming=0.0, outgoing=0.0):
    """Hermite unit ramp, retaining deliberate nonzero passage tangents."""
    t = max(0.0, min(1.0, value))
    return t*t*(3-2*t) + incoming*(t*t*t-2*t*t+t) + outgoing*(t*t*t-t*t)


def swing(value, stride, stance):
    """Paw recovery with support-matched velocity and zero contact acceleration."""
    t = max(0.0, min(1.0, value))
    tangent = -stride * (1-stance) / stance
    forward = -stride/2 + tangent*t + (stride-tangent)*smoother(t)
    arch = math.sin(math.pi*t)**3
    return forward, arch


def attack_step(phase, distance, lift, start=.34, plant=.61, release=.78, end=1.0):
    """Lift, replant under the driven body, then step back into the idle anchor.

    The held middle interval is a real support, not a sliding hoof. Both
    swing arcs meet it with zero vertical speed and no forward drift.
    """
    if phase <= start or phase >= end:
        return 0.0, 0.0, 0.0
    if phase < plant:
        u = (phase-start)/(plant-start)
        forward = distance*smoother(u)
        direction = 1
    elif phase < release:
        return distance, 0.0, 0.0
    else:
        u = (phase-release)/(end-release)
        forward = distance*(1-smoother(u))
        direction = -1
    arch = math.sin(math.pi*u)**2
    return forward, lift*arch, direction*.16*math.sin(2*math.pi*u)*arch
