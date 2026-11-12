'use client';

import { signIn, signOut } from 'next-auth/react';
import { UserInterface } from '@/interface/authInterface';
import { Dispatch, SetStateAction } from 'react';
import { refreshUserData } from './store';

// Google sign-in is a full-page redirect, not a popup. The user lands back on
// the landing page, which routes them once the context has loaded their record.
export const handleSignIn = () => signIn('google', { callbackUrl: '/' });

export const loadCurrentUser = (
  user: UserInterface,
  setUser: Dispatch<SetStateAction<UserInterface>>
) =>
  refreshUserData(user, setUser).catch((error) => {
    console.error('Failed to load the signed-in user', error);
  });

export const handleSignOut = () => signOut({ callbackUrl: '/' });
