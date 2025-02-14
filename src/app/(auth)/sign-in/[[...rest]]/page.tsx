import { SignIn } from '@clerk/nextjs'
import React from 'react'

const Page = () => {
  return <SignIn forceRedirectUrl={process.env.SIGN_IN_REDIRECT_URL} />
}

export default Page