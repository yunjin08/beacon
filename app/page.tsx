'use client';

import Spinner from '@/components/generics/Spinner';
import Image from 'next/image';
import { useUserContext } from '@/context/UserContext';
import { handleSignIn } from '@/db/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { insertUpskillingNodes } from '@/utils/graphUtils';
import axios from 'axios';

export default function Home() {
  const { user, setUser } = useUserContext();
  const [hasAccount, setHasAccount] = useState(false);
  const [hasAccountData, setHasAccountData] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLoginButtonClick = async () => {
    setIsLoading(true);
    await handleSignIn(setUser, setHasAccount, setHasAccountData);
  };

  useEffect(() => {
    if (hasAccountData) {
      router.push('/home');
    } else if (hasAccount) {
      router.push('/register');
    }
  }, [hasAccount, router, hasAccountData]);

  return (
    <main className="flex items-center justify-center h-full text-white">
      <div className="flex flex-col items-center justify-center h-full">
        <Image
          src="/generics/logo.png"
          alt="beacon logo"
          width={220}
          height={220}
        />
        <h1 className="font-bold text-5xl text-center mb-8 sm:text-7xl">
          Welcome to Beacon!
        </h1>
        <button
          className="flex border-2 py-3 px-4 gap-x-2 hover:bg-slate-700 rounded"
          onClick={handleLoginButtonClick}
        >
          Log In with Google{' '}
          <img src="/generics/google-logo.svg" alt="google logo" />
        </button>
      </div>

      {isLoading && <Spinner />}
    </main>
  );
}

