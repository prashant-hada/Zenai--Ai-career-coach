'use server'
import { auth } from "@clerk/nextjs/server"
import { db } from "@/lib/prisma"
import { generateInsightByAI } from "./insights"
import User, { FormData } from "@/types/User";
import { cookies } from "next/headers";

interface UpdateUserResponse{
    user: User;
    success:boolean
}

export async function updateUser(data:FormData):Promise<UpdateUserResponse>{
    try {
        const {userId} = await auth()
        if(!userId) throw new Error('Unauthorized');

        const userData = await db.user.findUnique({
            where:{
                clerkUserId:userId
            }
        })
        if(!userData) throw new Error("User not found");

        //Find indestry detaisl from DB
        //if not exist, then create new entry in DB
        // update user's infromation
        const result = await db.$transaction(async(tx)=>{
           //Find indestry detaisl from DB 
           let industryInsight= await tx.industryInsight.findUnique({
            where:{
                industry: data.industry
            }
           });
           //if not exist, then create new entry in DB
           if (!industryInsight) {
             const insights = await generateInsightByAI(data.industry);
            
             industryInsight = await tx.industryInsight.create({
               data: {
                 industry: data.industry,
                 salaryRange: JSON.parse(JSON.stringify(insights.salaryRange)) , 
                 growthRate: insights?.growthRate,
                 demandLevel: insights.demandLevel,
                 topSkills: insights.topSkills,
                 marketOutlook: insights.marketOutlook,
                 keyTrends: insights.keyTrends,
                 recommendedSkills: insights.recommendedSkills,
                 lastUpdated: insights.lastUpdated,
                 nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
               },
             });
           }
            const user = await tx.user.update({
                where:{
                    id:userData.id,
                },
                data:{
                    industry:data.industry,
                    experience:data.experience,
                    bio:data.bio,
                    skills:data.skills
                }
            })
           return {user, industryInsight}
        },{timeout:10000})

        return {success:true, user:result.user}
        
    } catch (error) {
        console.error("Error updating user and industry: ", (error as Error).message);
        throw new Error('Failed to update profile' + (error as Error).message);
    }
}

export async function getUserOnboardingStatus() {
    try {
        const {userId} = await auth()
        if(!userId) throw new Error('Unauthorized');

        const user = await db.user.findUnique({
            where:{
                clerkUserId:userId
            },
            select:{
                industry: true
            }
        })
        if(!user) throw new Error("User not found"); 

        return {
            isOnboarded: !!user?.industry
        }
    } catch (error) {
        console.error("Error checking onboarding status: ", (error as Error).message);
        throw new Error('Failed to check onboarding status');
    }
    
}

export async function checkOnboardingStatus() {
    try{
    const isOnboardedCookie = (await cookies()).get("isOnboarded")?.value;
    if(isOnboardedCookie) return {isOnboarded: isOnboardedCookie === 'true'};
    
    const isOnboarded = await getUserOnboardingStatus();
    if(isOnboarded){
        (await cookies()).set('isOnboarded', 'true', { maxAge: 60 * 60 * 24 * 7 })
    }

    return {isOnboarded};
    }
    catch (error) {
        console.error("Error checking onboarding status: ", (error as Error).message);
        return { isOnboarded: false }; // Fail-safe: Treat as not onboarded
    }  
}