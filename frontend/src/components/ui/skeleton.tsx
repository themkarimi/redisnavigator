import * as React from 'react'
import { cn } from '@/utils/cn'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('skeleton-shimmer rounded-md', className)} {...props} />
  )
}

export { Skeleton }
